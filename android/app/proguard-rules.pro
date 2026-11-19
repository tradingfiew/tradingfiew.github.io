# TradingFiew R8 app-specific rules.
# Android Gradle Plugin preserves manifest components automatically;
# Android Browser Helper, AdMob and UMP provide their own consumer rules.
# Keep this file minimal: a blanket -keep or -dontobfuscate defeats DEX optimization.

# Google Mobile Ads currently pulls a WorkManager/Room combination where
# androidx.work.impl.WorkDatabase_Impl is created reflectively at app startup.
# Without these narrowly scoped rules R8 can rename/strip the implementation,
# causing InitializationProvider to crash before TradingFiew launches.
# Android signed 1.0.5 emulator logcat confirmed this exact failure.
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
