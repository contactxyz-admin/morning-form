# Morning Form iOS Wrapper

This is a native SwiftUI shell for Morning Form that can:

- request Apple Health / HealthKit permissions
- read basic Apple Health metrics locally on-device
- host the Morning Form web experience in a native container
- provide the foundation for later Terra Mobile SDK integration if needed

## What this gives us

Unlike the web app, an iOS app can actually request HealthKit permissions from Apple Health.

This wrapper is designed to be the first step toward:

- Apple Health authorization
- background health data fetch
- secure handoff of health summaries into Morning Form

## Local setup

1. Install full Xcode from the App Store.
2. Point `xcode-select` at full Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

3. Open this folder in Xcode by generating a project from `project.yml`.

Recommended:

```bash
brew install xcodegen
cd /Users/reubenselby/Desktop/morning-form/ios/MorningFormIOS
xcodegen generate
open MorningFormIOS.xcodeproj
```

## Web app URL

The native shell currently targets:

```txt
http://localhost:3000
```

When testing on a physical iPhone, replace this with your Mac's LAN IP, for example:

```txt
http://192.168.1.10:3000
```

That value lives in `Config.swift`.

## Current Apple Health scope

The wrapper currently requests read access for:

- sleep analysis
- steps
- heart rate
- heart rate variability (SDNN)
- resting heart rate

## Next implementation passes

- post the HealthKit summary into Morning Form server endpoints
- add background refresh and cached sync history
- add Terra Mobile SDK if we want Terra as the aggregation/control layer
- build native auth/session handoff between iOS shell and web app

