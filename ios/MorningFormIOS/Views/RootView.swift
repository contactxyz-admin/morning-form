import SwiftUI

struct RootView: View {
    @EnvironmentObject private var healthKitManager: HealthKitManager
    @State private var showWebApp = false
    @State private var webDestination = Config.morningFormWebURL

    var body: some View {
        NavigationStack {
            Group {
                if showWebApp {
                    EmbeddedWebView(url: webDestination)
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
            .onChange(of: healthKitManager.lastSyncMessage) { _, newValue in
                guard newValue != nil else { return }
                webDestination = Config.healthIntegrationsURL
                showWebApp = true
            }
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
            } else if let syncMessage = healthKitManager.lastSyncMessage {
                Text(syncMessage)
                    .font(.caption)
                    .foregroundStyle(.green)
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

            Button {
                Task {
                    await healthKitManager.syncSnapshotToMorningForm()
                }
            } label: {
                Text(healthKitManager.isUploadingSnapshot ? "Syncing..." : "Sync to Morning Form")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(healthKitManager.isUploadingSnapshot || healthKitManager.isLoadingSnapshot)
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
                webDestination = Config.morningFormWebURL
                showWebApp = true
            }
            .buttonStyle(.bordered)

            Text("After syncing, check Health Integrations or the home dashboard in Morning Form to confirm Apple Health is reflected in-product.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
