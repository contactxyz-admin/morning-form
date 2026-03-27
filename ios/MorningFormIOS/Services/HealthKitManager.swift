import Foundation
import HealthKit

struct HealthSnapshot: Equatable {
    var stepCount: Double?
    var heartRate: Double?
    var restingHeartRate: Double?
    var heartRateVariability: Double?
    var sleepHours: Double?
}

private struct AppleHealthUploadPayload: Encodable {
    let stepCount: Double?
    let heartRate: Double?
    let restingHeartRate: Double?
    let heartRateVariability: Double?
    let sleepHours: Double?
    let capturedAt: String
}

@MainActor
final class HealthKitManager: ObservableObject {
    @Published var authorizationStatus: HKAuthorizationStatus = .notDetermined
    @Published var isRequestingAuthorization = false
    @Published var isLoadingSnapshot = false
    @Published var isUploadingSnapshot = false
    @Published var lastError: String?
    @Published var lastSyncMessage: String?
    @Published var snapshot = HealthSnapshot()

    private let store = HKHealthStore()

    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestAuthorization() async {
        guard isAvailable else {
            lastError = "Health data is not available on this device."
            return
        }

        let readTypes = healthReadTypes
        isRequestingAuthorization = true
        lastError = nil

        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            if let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) {
                authorizationStatus = store.authorizationStatus(for: heartRateType)
            }
            await refreshSnapshot()
        } catch {
            lastError = error.localizedDescription
        }

        isRequestingAuthorization = false
    }

    func refreshSnapshot() async {
        guard isAvailable else { return }
        isLoadingSnapshot = true
        lastError = nil

        do {
            async let steps = fetchTodayStepCount()
            async let heartRate = fetchLatestQuantity(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()))
            async let restingHeartRate = fetchLatestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()))
            async let hrv = fetchLatestQuantity(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli))
            async let sleep = fetchLastNightSleepHours()

            snapshot = HealthSnapshot(
                stepCount: try await steps,
                heartRate: try await heartRate,
                restingHeartRate: try await restingHeartRate,
                heartRateVariability: try await hrv,
                sleepHours: try await sleep
            )
            lastSyncMessage = nil
        } catch {
            lastError = error.localizedDescription
        }

        isLoadingSnapshot = false
    }

    func syncSnapshotToMorningForm() async {
        isUploadingSnapshot = true
        lastError = nil
        lastSyncMessage = nil

        do {
            let payload = AppleHealthUploadPayload(
                stepCount: snapshot.stepCount,
                heartRate: snapshot.heartRate,
                restingHeartRate: snapshot.restingHeartRate,
                heartRateVariability: snapshot.heartRateVariability,
                sleepHours: snapshot.sleepHours,
                capturedAt: ISO8601DateFormatter().string(from: Date())
            )

            var request = URLRequest(url: Config.appleHealthUploadURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(payload)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }

            guard (200..<300).contains(httpResponse.statusCode) else {
                let message = String(data: data, encoding: .utf8) ?? "Upload failed"
                throw NSError(domain: "MorningFormUpload", code: httpResponse.statusCode, userInfo: [
                    NSLocalizedDescriptionKey: message
                ])
            }

            lastSyncMessage = "Apple Health synced to Morning Form."
        } catch {
            lastError = error.localizedDescription
        }

        isUploadingSnapshot = false
    }

    private var healthReadTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleepType)
        }

        [
            HKQuantityTypeIdentifier.stepCount,
            HKQuantityTypeIdentifier.heartRate,
            HKQuantityTypeIdentifier.restingHeartRate,
            HKQuantityTypeIdentifier.heartRateVariabilitySDNN
        ].forEach { identifier in
            if let type = HKObjectType.quantityType(forIdentifier: identifier) {
                types.insert(type)
            }
        }

        return types
    }

    private func fetchTodayStepCount() async throws -> Double? {
        guard let quantityType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return nil }

        return try await withCheckedThrowingContinuation { continuation in
            let startOfDay = Calendar.current.startOfDay(for: Date())
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: quantityType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let value = result?.sumQuantity()?.doubleValue(for: .count())
                continuation.resume(returning: value)
            }
            self.store.execute(query)
        }
    }

    private func fetchLatestQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }

        return try await withCheckedThrowingContinuation { continuation in
            let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
            let query = HKSampleQuery(sampleType: quantityType, predicate: nil, limit: 1, sortDescriptors: sortDescriptors) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let sample = samples?.first as? HKQuantitySample
                let value = sample?.quantity.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            self.store.execute(query)
        }
    }

    private func fetchLastNightSleepHours() async throws -> Double? {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }

        return try await withCheckedThrowingContinuation { continuation in
            let startDate = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictStartDate)
            let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]

            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sortDescriptors) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let asleepSamples = (samples as? [HKCategorySample])?.filter {
                    $0.value == HKCategoryValueSleepAnalysis.asleep.rawValue ||
                    $0.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
                    $0.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
                    $0.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue
                } ?? []

                let totalSeconds = asleepSamples.reduce(0.0) { partialResult, sample in
                    partialResult + sample.endDate.timeIntervalSince(sample.startDate)
                }

                continuation.resume(returning: totalSeconds > 0 ? totalSeconds / 3600 : nil)
            }

            self.store.execute(query)
        }
    }
}
