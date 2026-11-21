import 'package:flutter/material.dart';

/// Token set every theme (built-in or user-made) must provide. Stored as JSON in custom_themes.colors.
class NexoraPalette {
  const NexoraPalette({required this.name, required this.dark, required this.primary, required this.accent,
      required this.background, required this.sidebar, required this.card, required this.text,
      required this.textMuted, required this.border});
  final String name; final bool dark;
  final Color primary, accent, background, sidebar, card, text, textMuted, border;

  Map<String, dynamic> toJson() => {'name': name, 'dark': dark, 'primary': primary.value, 'accent': accent.value,
      'background': background.value, 'sidebar': sidebar.value, 'card': card.value, 'text': text.value,
      'textMuted': textMuted.value, 'border': border.value};
  factory NexoraPalette.fromJson(Map<String, dynamic> j) => NexoraPalette(name: j['name'], dark: j['dark'],
      primary: Color(j['primary']), accent: Color(j['accent']), background: Color(j['background']),
      sidebar: Color(j['sidebar']), card: Color(j['card']), text: Color(j['text']),
      textMuted: Color(j['textMuted']), border: Color(j['border']));

  ThemeData toThemeData() {
    final scheme = ColorScheme.fromSeed(seedColor: primary, brightness: dark ? Brightness.dark : Brightness.light)
        .copyWith(primary: primary, secondary: accent, surface: card, onSurface: text, outline: border);
    return ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: background,
        cardColor: card, dividerColor: border,
        textTheme: ThemeData(brightness: dark ? Brightness.dark : Brightness.light).textTheme.apply(bodyColor: text, displayColor: text));
  }
}

const builtInPalettes = <NexoraPalette>[
  NexoraPalette(name: 'Light', dark: false, primary: Color(0xFF4F46E5), accent: Color(0xFF0EA5E9),
      background: Color(0xFFFAFAF9), sidebar: Color(0xFFF4F4F2), card: Color(0xFFFFFFFF),
      text: Color(0xFF1C1917), textMuted: Color(0xFF78716C), border: Color(0xFFE7E5E4)),
  NexoraPalette(name: 'Dark', dark: true, primary: Color(0xFF818CF8), accent: Color(0xFF38BDF8),
      background: Color(0xFF151517), sidebar: Color(0xFF1B1B1E), card: Color(0xFF212125),
      text: Color(0xFFF4F4F5), textMuted: Color(0xFFA1A1AA), border: Color(0xFF2E2E33)),
  NexoraPalette(name: 'OLED Black', dark: true, primary: Color(0xFF818CF8), accent: Color(0xFF34D399),
      background: Color(0xFF000000), sidebar: Color(0xFF000000), card: Color(0xFF0C0C0C),
      text: Color(0xFFFFFFFF), textMuted: Color(0xFF9CA3AF), border: Color(0xFF1F1F1F)),
  NexoraPalette(name: 'Nord', dark: true, primary: Color(0xFF88C0D0), accent: Color(0xFFA3BE8C),
      background: Color(0xFF2E3440), sidebar: Color(0xFF292E39), card: Color(0xFF3B4252),
      text: Color(0xFFECEFF4), textMuted: Color(0xFFD8DEE9), border: Color(0xFF434C5E)),
  // TODO(next stage): Midnight, Dracula, Solarized, Forest, Ocean, Lavender, Rose, Warm Sand, Minimal Gray, High Contrast
];
