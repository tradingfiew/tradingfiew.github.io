"""Android TWA configuration regressions checked without an emulator."""
import pathlib
import re
import unittest
import xml.etree.ElementTree as ET

BASE = pathlib.Path(__file__).resolve().parents[1]
ANDROID = "{http://schemas.android.com/apk/res/android}"


class AndroidTwaConfigTest(unittest.TestCase):
    def test_twa_splash_uses_private_files_directory(self):
        root = ET.parse(BASE / "android/app/src/main/res/xml/filepaths.xml").getroot()
        self.assertEqual(root.tag, "paths")
        files_paths = [
            p for p in root.findall("files-path")
            if p.get("name") == "twa_splash" and p.get("path") == "twa_splash/"
        ]
        self.assertEqual(len(files_paths), 1)
        # Do not accidentally expose all cache files to the browser.
        self.assertFalse(root.findall("root-path"))
        self.assertFalse(root.findall("cache-path"))

    def test_file_provider_authority_matches_twa_metadata(self):
        manifest = ET.parse(BASE / "android/app/src/main/AndroidManifest.xml").getroot()
        app = manifest.find("application")
        provider = next(
            x for x in app.findall("provider")
            if x.get(ANDROID + "name") == "androidx.core.content.FileProvider"
        )
        self.assertFalse(provider.get(ANDROID + "exported") == "true")
        provider_authority = provider.get(ANDROID + "authorities")
        launcher = next(
            x for x in app.findall("activity")
            if x.get(ANDROID + "name") == ".LauncherActivity"
        )
        metadata = {
            node.get(ANDROID + "name"): node.get(ANDROID + "value")
            for node in launcher.findall("meta-data")
        }
        self.assertEqual(
            provider_authority,
            metadata["android.support.customtabs.trusted.FILE_PROVIDER_AUTHORITY"],
        )
        self.assertEqual(provider_authority, "com.ribhlab.tradingfiew.fileprovider")

    def test_manage_data_launcher_is_declared_as_required_by_browser_helper(self):
        # Browser Helper 2.7 calls setComponentEnabledSetting for this
        # component during TWA launch; omission causes a fatal exception.
        root = ET.parse(BASE / "android/app/src/main/AndroidManifest.xml").getroot()
        app = root.find("application")
        expected = "com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity"
        activities = [a for a in app.findall("activity")
                      if a.get(ANDROID + "name") == expected]
        self.assertEqual(len(activities), 1)
        self.assertNotEqual(activities[0].get(ANDROID + "enabled"), "false")
        self.assertEqual(app.get(ANDROID + "manageSpaceActivity"), expected)
        metadata = {m.get(ANDROID + "name"): m.get(ANDROID + "value")
                    for m in activities[0].findall("meta-data")}
        self.assertEqual(
            metadata["android.support.customtabs.trusted.MANAGE_SPACE_URL"],
            "https://tradingfiew.github.io/",
        )

    def test_app_has_monotonic_update_version_and_correct_identity(self):
        build = (BASE / "android/app/build.gradle").read_text()
        self.assertRegex(build, r"applicationId\s+'com\.ribhlab\.tradingfiew'")
        self.assertRegex(build, r"versionCode\s+3")
        self.assertRegex(build, r"versionName\s+'1\.0\.2'")
        self.assertIn("targetSdk 36", build)


if __name__ == "__main__":
    unittest.main()
