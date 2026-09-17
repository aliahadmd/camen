const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const NDK_VERSION = '27.2.12479018';

// SDK 57 Groovy templates have no static setting for release signing. Append a
// managed DSL block rather than rewriting (or copying) existing credentials.
function managedBlock(contents, name, body) {
  const start = `// @generated begin ${name}`;
  const end = `// @generated end ${name}`;
  const first = contents.indexOf(start);
  if (first !== -1) {
    const last = contents.indexOf(end, first);
    if (last === -1 || contents.indexOf(start, first + start.length) !== -1) {
      throw new Error(`Malformed ${name} block; refusing to modify Gradle.`);
    }
    contents = contents.slice(0, first) + contents.slice(last + end.length).replace(/^\r?\n/, '');
  }
  return `${contents.trimEnd()}\n\n${start}\n${body}\n${end}\n`;
}

const signingBody = `// Values are resolved only by Gradle, never serialized into Expo config.
// Supply all four CAMEN_RELEASE_* values via ~/.gradle/gradle.properties or env.
def camenSigningValues = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'].collectEntries { suffix ->
    def name = "CAMEN_RELEASE_" + suffix
    [(suffix): providers.gradleProperty(name).orElse(providers.environmentVariable(name)).getOrNull()]
}

androidComponents.finalizeDsl { androidDsl ->
    androidDsl.ndkVersion = "${NDK_VERSION}"
    def releaseType = androidDsl.buildTypes.getByName('release')
    def existingSigning = releaseType.signingConfig
    def externalRequested = camenSigningValues.values().any { it != null }
    // Preserve a previously provisioned non-debug release signer verbatim.
    // Fresh Expo templates point release at debug: replace that fallback.
    if (externalRequested || existingSigning == null || existingSigning.name == 'debug') {
        def signer = androidDsl.signingConfigs.maybeCreate('camenRelease')
        signer.storeFile = camenSigningValues.STORE_FILE ? rootProject.file(camenSigningValues.STORE_FILE) : null
        signer.storePassword = camenSigningValues.STORE_PASSWORD
        signer.keyAlias = camenSigningValues.KEY_ALIAS
        signer.keyPassword = camenSigningValues.KEY_PASSWORD
        releaseType.signingConfig = signer
    }

    def signer = releaseType.signingConfig
    def signingReady = signer != null && signer.name != 'debug' &&
        signer.storeFile != null && signer.storeFile.isFile() &&
        signer.storeFile.name != 'debug.keystore' &&
        signer.storePassword != null && !signer.storePassword.isEmpty() &&
        signer.keyAlias != null && !signer.keyAlias.isEmpty() && signer.keyAlias != 'androiddebugkey' &&
        signer.keyPassword != null && !signer.keyPassword.isEmpty()
    def validation = tasks.register('camenValidateSigning') {
        doLast {
            if (!signingReady) {
                throw new GradleException('Camen release signing is missing or uses the debug key. Provision the existing release keystore and all four CAMEN_RELEASE_* values (STORE_FILE, STORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD) in external Gradle properties or environment. Never generate a replacement key for an update.')
            }
        }
    }
    // Task dependencies cover aggregate tasks and abbreviated CLI task names,
    // unlike inspecting startParameter.taskNames. Debug-only builds still work.
    tasks.configureEach { task ->
        if (task.name.toLowerCase(java.util.Locale.ROOT).contains('release')) {
            task.dependsOn(validation)
        }
    }
}`;

function patchProjectGradle(contents) {
  return managedBlock(contents, 'camen-ndk', `// Pin all native subprojects, not just the application module.\next.ndkVersion = "${NDK_VERSION}"`);
}

function patchAppGradle(contents) {
  return managedBlock(contents, 'camen-release', signingBody);
}

function withCamenRelease(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Camen release plugin requires an SDK 57 Groovy project build.gradle.');
    mod.modResults.contents = patchProjectGradle(mod.modResults.contents);
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Camen release plugin requires an SDK 57 Groovy app build.gradle.');
    mod.modResults.contents = patchAppGradle(mod.modResults.contents);
    return mod;
  });
}

module.exports = withCamenRelease;
module.exports.patchAppGradle = patchAppGradle;
module.exports.patchProjectGradle = patchProjectGradle;
module.exports.NDK_VERSION = NDK_VERSION;
