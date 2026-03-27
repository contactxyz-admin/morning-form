import SwiftUI

struct RootView: View {
    @EnvironmentObject private var healthKitManager: HealthKitManager
    @State private var showWebApp = false

    var body: some View {
        NavigationStack {
            Group {
                if showWebApp {
                    EmbeddedWebView(url: Config.morningFormWebURL)
                        .ignoresSafeArea()
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            header
                            authorizationCard
                            HealthSummaryCard(snapshot: healthKitManager.snapshot)
                            launchCard
                        }
                        .padding(20)
                    }
                    .background(Color(.systemGroupedBackground))
                }
            }
            .navigationTitle(showWebApp ? "Morning Form" : "Morning Form iOS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(showWebApp ? "Native" : "Web") {
                        showWebApp.toggle()
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Apple Health wrapper")
                .font(.largeTitle.bold())
            Text("Use this native shell to request HealthKit permissions and bridge Apple Health data into Morning Form.")
                .foregroundStyle(.secondary)
        }
    }

    private var authorizationCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Health access")
                .font(.headline)

            if let error = healthKitManager.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else {
                Text("Read sleep, heart rate, HRV, resting heart rate, and steps from Apple Health.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                Button {
                    Task {
                        await healthKitManager.requestAuthorization()
                    }
                } label: {
                    Text(healthKitManager.isRequestingAuthorization ? "Requesting..." : "Authorize Apple Health")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(healthKitManager.isRequestingAuthorization)

                Button {
                    Task {
                        await healthKitManager.refreshSnapshot()
                    }
                } label: {
                    Text(healthKitManager.isLoadingSnapshot ? "Refreshing..." : "Refresh")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(healthKitManager.isLoadingSnapshot)
            }
        }
        .padding(20)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var launchCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Morning Form web app")
                .font(.headline)
            Text("When testing on a real device, update the web URL in Config.swift to your Mac's LAN IP so the iPhone can reach the local Next.js server.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button("Open web experience") {
                showWebApp = true
            }
            .buttonStyle(.bordered)
        }
        .padding(20)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

