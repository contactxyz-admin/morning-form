import SwiftUI

@main
struct MorningFormIOSApp: App {
    @StateObject private var healthKitManager = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(healthKitManager)
        }
    }
}

