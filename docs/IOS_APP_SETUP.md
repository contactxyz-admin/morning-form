# iOS App Setup

Morning Form now includes a native iOS wrapper scaffold at:

[`ios/MorningFormIOS`](/Users/reubenselby/Desktop/morning-form/ios/MorningFormIOS)

## Why this exists

Apple Health cannot be connected from a browser-only app. HealthKit permission prompts must come from a native iOS app.

This wrapper gives us:

- native HealthKit authorization
- native Apple Health reads
- a host shell for the Morning Form web app

## Before you can run it

You need full Xcode installed and selected.

Current local machine state:

- Command Line Tools are installed
- full `xcodebuild` is not currently available from the selected developer directory

Fix that with:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Generate the Xcode project

Recommended approach:

1. install XcodeGen
2. generate the project from `project.yml`

```bash
brew install xcodegen
cd /Users/reubenselby/Desktop/morning-form/ios/MorningFormIOS
xcodegen generate
open MorningFormIOS.xcodeproj
```

## Local web app access from iPhone

The native shell points at:

```txt
http://localhost:3000
```

That works for the simulator, but not for a physical iPhone.

For a real device:

1. start the Next app on your Mac
2. find your Mac's LAN IP
3. update `Config.swift`

Example:

```swift
static let morningFormWebURL = URL(string: "http://192.168.1.10:3000")!
```

## HealthKit data currently read

- sleep analysis
- step count
- heart rate
- resting heart rate
- heart rate variability (SDNN)

## Recommended next pass

- add an API endpoint for native Apple Health uploads
- persist device sync history in Prisma
- add background fetch / refresh
- optionally add Terra Mobile SDK if you want Terra as the long-term integration layer

