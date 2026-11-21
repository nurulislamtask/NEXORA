import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/palettes.dart';

void main() => runApp(const ProviderScope(child: NexoraApp()));

/// Stage-1 shell only. Feature modules (tasks, notes, ...) are NOT implemented yet.
class NexoraApp extends StatelessWidget {
  const NexoraApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'NEXORA', theme: builtInPalettes.first.toThemeData(),
      darkTheme: builtInPalettes[1].toThemeData(), themeMode: ThemeMode.system,
      home: const Scaffold(body: Center(child: Text('NEXORA'))));
}
