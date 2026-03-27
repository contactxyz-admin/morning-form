import SwiftUI

struct HealthSummaryCard: View {
    let snapshot: HealthSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Apple Health")
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                metric("Sleep", snapshot.sleepHours.map { String(format: "%.1fh", $0) } ?? "—")
                metric("Steps", snapshot.stepCount.map { String(Int($0)) } ?? "—")
                metric("Heart Rate", snapshot.heartRate.map { "\(Int($0)) bpm" } ?? "—")
                metric("HRV", snapshot.heartRateVariability.map { "\(Int($0)) ms" } ?? "—")
            }
        }
        .padding(20)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.headline.monospacedDigit())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

