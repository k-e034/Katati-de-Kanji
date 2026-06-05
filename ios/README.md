# iOS port for カタチで漢字

This folder contains the first iOS implementation pieces for the app:

- `Shared/KatachiKanjiSearch.swift`: Swift port of the IDS search engine.
- `Keyboard/KatachiKeyboardViewController.swift`: custom keyboard extension UI.
- `App/ViewController.swift`: small host app screen for setup/testing.
- `Plists/`: starter `Info.plist` files for the app and keyboard extension.

## Xcode setup

Create a new Xcode iOS app project, then add a **Custom Keyboard Extension**
target.

Recommended product names:

- App target: `KatachiKanji`
- Keyboard extension: `KatachiKanjiKeyboard`
- Bundle IDs:
  - `jp.example.katachikanji`
  - `jp.example.katachikanji.keyboard`

Add these files to targets:

- App target:
  - `Shared/KatachiKanjiSearch.swift`
  - `App/AppDelegate.swift`
  - `App/SceneDelegate.swift`
  - `App/ViewController.swift`
  - `Plists/AppInfo.plist` as the target Info.plist, or copy its keys into Xcode.
- Keyboard extension target:
  - `Shared/KatachiKanjiSearch.swift`
  - `Keyboard/KatachiKeyboardViewController.swift`
  - `Plists/KeyboardInfo.plist` as the extension Info.plist, or copy its keys into Xcode.

Link both targets with `libsqlite3.tbd`.

## Assets

Add these existing repository files to both iOS targets as bundle resources:

- `android/app/src/main/assets/idsfind.db`
- `android/app/src/main/assets/reading-index.json`
- `android/app/src/main/assets/fonts/ipamjm.ttf`

For the font, add this key to the app target Info.plist if you use it outside the keyboard:

```xml
<key>UIAppFonts</key>
<array>
  <string>ipamjm.ttf</string>
</array>
```

Keyboard extensions have their own bundle, so make sure the resources are also copied into the extension target.

## Notes

iOS keyboard extensions cannot programmatically open Settings or switch keyboards the same way Android can. The host app should guide the user to:

`Settings > General > Keyboard > Keyboards > Add New Keyboard > カタチで漢字`

Full Access is not required because search runs locally against bundled assets.
