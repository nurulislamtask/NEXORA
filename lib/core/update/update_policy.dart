import 'package:pub_semver/pub_semver.dart';

/// Row from `app_versions` (one per platform).
class UpdatePolicy {
  UpdatePolicy({required this.latest, required this.minimumSupported, required this.url,
      required this.notes, required this.isMandatory, this.reason});
  final Version latest, minimumSupported;
  final String url, notes;
  final bool isMandatory;
  final String? reason;

  factory UpdatePolicy.fromJson(Map<String, dynamic> j) => UpdatePolicy(
        latest: Version.parse(j['latest_version']),
        minimumSupported: Version.parse(j['minimum_supported_version']),
        url: j['update_url'], notes: j['release_notes'] ?? '',
        isMandatory: j['is_mandatory'] ?? false, reason: j['mandatory_reason']);
}

enum UpdateState { upToDate, optional, mandatory }

/// Mandatory only if installed < minimum supported. A merely newer release is optional,
/// so minor feature releases never force an update.
UpdateState evaluateUpdate(Version installed, UpdatePolicy p) {
  if (installed < p.minimumSupported) return UpdateState.mandatory;
  if (installed < p.latest) return UpdateState.optional;
  return UpdateState.upToDate;
}
