import Foundation

enum Config {
    // Replace with your Mac's LAN IP when testing on a physical iPhone.
    static let morningFormWebURL = URL(string: "http://localhost:3000")!
    static let appleHealthUploadURL = morningFormWebURL.appending(path: "/api/health/apple-health")
    static let healthIntegrationsURL = morningFormWebURL.appending(path: "/settings/integrations")
}
