import 'package:flutter_test/flutter_test.dart';
import 'package:pub_semver/pub_semver.dart';
import 'package:nexora/core/update/update_policy.dart';

UpdatePolicy p(String latest, String min) => UpdatePolicy(latest: Version.parse(latest),
    minimumSupported: Version.parse(min), url: 'u', notes: '', isMandatory: false);

void main() {
  test('below minimum is mandatory', () => expect(evaluateUpdate(Version.parse('1.0.0'), p('1.2.0', '1.1.0')), UpdateState.mandatory));
  test('between min and latest is optional', () => expect(evaluateUpdate(Version.parse('1.1.5'), p('1.2.0', '1.1.0')), UpdateState.optional));
  test('latest is up to date', () => expect(evaluateUpdate(Version.parse('1.2.0'), p('1.2.0', '1.1.0')), UpdateState.upToDate));
}
