const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const plugin = require('../plugins/withCamenRelease.cjs');

const root = path.resolve(__dirname, '..');
let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok - ${name}`);
}

// Synthetic inputs only: do not require the ignored Android tree or read keys.
const fresh = `android {
    ndkVersion rootProject.ext.ndkVersion
    signingConfigs {
        debug { storeFile file('debug.keystore') }
    }
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release { signingConfig signingConfigs.debug }
    }
}
`;
const provisioned = fresh.replace('release { signingConfig signingConfigs.debug }',
  'release { signingConfig signingConfigs.ownerProvided }');

test('app and root Gradle transforms are byte-idempotent', () => {
  for (const input of [fresh, provisioned, fresh.replaceAll('\n', '\r\n')]) {
    const once = plugin.patchAppGradle(input);
    assert.equal(plugin.patchAppGradle(once), once);
    assert.ok(once.startsWith(input.trimEnd()), 'unmanaged configuration is preserved');
  }
  const rootInput = 'ext { customSetting = "preserve-me" }\n';
  const once = plugin.patchProjectGradle(rootInput);
  assert.equal(plugin.patchProjectGradle(once), once);
  assert.ok(once.startsWith(rootInput.trimEnd()));
  assert.ok(once.includes('ext.ndkVersion = "27.2.12479018"'));
});

test('malformed managed blocks fail closed', () => {
  assert.throws(() => plugin.patchAppGradle('// @generated begin camen-release\n'), /Malformed/);
  assert.throws(() => plugin.patchAppGradle(plugin.patchAppGradle(fresh) + '// @generated begin camen-release'), /Malformed/);
});

test('gradle.properties pins the single-device arm64 ABI, preserving other entries', () => {
  const parsed = (contents) => plugin.patchGradleProperties(
    contents.split('\n').filter(Boolean).map((line) => {
      if (line.startsWith('#')) return { type: 'comment', value: line.slice(1).trimStart() };
      const eq = line.indexOf('=');
      return { type: 'property', key: line.slice(0, eq), value: line.slice(eq + 1) };
    }),
  );
  // Existing four-ABI template line is replaced in place.
  const out = parsed('enableProguardInReleaseBuilds=false\nreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64\nnewArchEnabled=true');
  const arch = out.filter((item) => item.type === 'property' && item.key === 'reactNativeArchitectures');
  assert.equal(arch.length, 1);
  assert.equal(arch[0].value, 'arm64-v8a');
  assert.ok(out.some((item) => item.type === 'property' && item.key === 'newArchEnabled'));
  // Missing line is appended.
  const added = parsed('newArchEnabled=true');
  assert.equal(added.at(-1).key, 'reactNativeArchitectures');
  assert.equal(added.at(-1).value, 'arm64-v8a');
  // Idempotent.
  assert.equal(plugin.patchGradleProperties(plugin.patchGradleProperties([])).length, 1);
});

test('plugin registers Expo Gradle mods without reading signing environment', () => {
  const prior = process.env.CAMEN_RELEASE_STORE_PASSWORD;
  process.env.CAMEN_RELEASE_STORE_PASSWORD = 'fixture-secret-do-not-serialize';
  try {
    const config = plugin({ name: 'fixture', slug: 'fixture' });
    assert.equal(typeof config.mods.android.appBuildGradle, 'function');
    assert.equal(typeof config.mods.android.projectBuildGradle, 'function');
    assert.equal(typeof config.mods.android.gradleProperties, 'function');
    assert.ok(!JSON.stringify(config).includes(process.env.CAMEN_RELEASE_STORE_PASSWORD));
    assert.ok(!plugin.patchAppGradle(fresh).includes(process.env.CAMEN_RELEASE_STORE_PASSWORD));
  } finally {
    if (prior === undefined) delete process.env.CAMEN_RELEASE_STORE_PASSWORD;
    else process.env.CAMEN_RELEASE_STORE_PASSWORD = prior;
  }
});

test('tracked app config encodes E01/E02 identity and least privilege', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(config.android.versionCode, 16);
  assert.equal(config.android.allowBackup, false);
  for (const permission of ['READ_MEDIA_AUDIO', 'SYSTEM_ALERT_WINDOW', 'WRITE_SETTINGS', 'ACTIVITY_RECOGNITION']) {
    assert.ok(config.android.blockedPermissions.includes(`android.permission.${permission}`));
  }
  assert.ok(config.plugins.includes('./plugins/withCamenRelease.cjs'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.expo.autolinking.android.buildFromSource.includes('expo-camera'));
});

// Optional integration test: real Gradle task engine, fake Android DSL. This
// tests the emitted Groovy and task execution without Android SDK/AGP downloads,
// real credentials, signing an APK, or touching the generated Android project.
// Usage: CAMEN_TEST_GRADLE=/absolute/path/to/gradle node scripts/test-build-config.cjs
if (process.env.CAMEN_TEST_GRADLE) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'camen-gradle-fixture-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('CAMEN_RELEASE_') && !key.startsWith('ORG_GRADLE_PROJECT_CAMEN_RELEASE_')));
  const mock = `
class FixtureSigner {
    String name
    File storeFile
    String storePassword
    String keyAlias
    String keyPassword
}
class FixtureSigners {
    Map entries = [:]
    def maybeCreate(String name) {
        if (!entries.containsKey(name)) entries[name] = new FixtureSigner(name: name)
        entries[name]
    }
}
class FixtureComponents {
    Object dsl
    void finalizeDsl(Closure action) { action.call(dsl) }
}
def signers = new FixtureSigners()
def existing = signers.maybeCreate('debug')
if (providers.gradleProperty('fixtureExisting').isPresent()) {
    existing = signers.maybeCreate('ownerProvided')
    existing.storeFile = file('fixture.jks')
    existing.storePassword = 'fixture-placeholder'
    existing.keyAlias = 'owner-alias'
    existing.keyPassword = 'fixture-placeholder'
}
def release = new Expando(signingConfig: existing)
def fixtureAndroidDsl = new Expando(ndkVersion: 'old', signingConfigs: signers,
    buildTypes: [getByName: { String name -> release }] as FixtureBuildTypes)
ext.androidComponents = new FixtureComponents(dsl: fixtureAndroidDsl)
class FixtureBuildTypes { Closure getByName; def getByName(String name) { getByName.call(name) } }
tasks.register('assembleDebug')
tasks.register('assembleRelease')
tasks.register('bundleRelease')
tasks.register('assemble') { dependsOn('assembleDebug', 'assembleRelease') }
`;
  const assertions = `
tasks.register('inspectFixture') {
    doLast {
        assert fixtureAndroidDsl.ndkVersion == '27.2.12479018'
        assert release.signingConfig.name != 'debug'
        if (providers.gradleProperty('fixtureExisting').isPresent() && !providers.gradleProperty('CAMEN_RELEASE_STORE_FILE').isPresent()) {
            assert release.signingConfig.is(existing)
            assert existing.keyAlias == 'owner-alias'
        }
    }
}
`;
  fs.writeFileSync(path.join(temp, 'settings.gradle'), "rootProject.name = 'camen-signing-fixture'\n");
  fs.writeFileSync(path.join(temp, 'build.gradle'), plugin.patchAppGradle(mock) + assertions);
  fs.writeFileSync(path.join(temp, 'fixture.jks'), 'not-a-real-key');
  const credentialArgs = ['STORE_FILE=fixture.jks', 'STORE_PASSWORD=fixture-placeholder',
    'KEY_ALIAS=owner-alias', 'KEY_PASSWORD=fixture-placeholder'].map(value => `-PCAMEN_RELEASE_${value}`);
  const run = (tasks, extra = []) => spawnSync(process.env.CAMEN_TEST_GRADLE,
    ['-p', temp, '--gradle-user-home', path.join(temp, 'gradle-home'), '--offline', '--no-daemon', '--console=plain', '-q', ...tasks, ...extra],
    { encoding: 'utf8', env, timeout: 120000 });
  try {
    test('Gradle: missing credentials permit debug but reject release, bundle, aggregate and abbreviated tasks', () => {
      const debug = run(['assembleDebug', 'inspectFixture']);
      assert.equal(debug.status, 0, debug.stderr);
      for (const task of ['assembleRelease', 'bundleRelease', 'assemble', 'aR']) {
        const result = run([task]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Camen release signing is missing/);
      }
    });
    test('Gradle: complete external properties configure the signer; partial or debug credentials fail', () => {
      const ready = run(['assembleRelease', 'inspectFixture'], credentialArgs);
      assert.equal(ready.status, 0, ready.stderr);
      for (const args of [credentialArgs.slice(0, 3), [...credentialArgs, '-PCAMEN_RELEASE_KEY_ALIAS=androiddebugkey'],
        [...credentialArgs, '-PCAMEN_RELEASE_STORE_FILE=missing.jks']]) {
        const result = run(['assembleRelease'], args);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Camen release signing is missing/);
      }
    });
    test('Gradle: existing owner signing survives; incomplete external overrides do not silently fall back', () => {
      const existing = run(['assembleRelease', 'inspectFixture'], ['-PfixtureExisting=true']);
      assert.equal(existing.status, 0, existing.stderr);
      const partial = run(['assembleRelease'], ['-PfixtureExisting=true', credentialArgs[0]]);
      assert.notEqual(partial.status, 0);
      assert.match(partial.stderr, /Camen release signing is missing/);
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
console.log(`All ${count} build-config tests passed.`);
