import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type, useTheme } from '../theme/theme';

/** Temporary screen used while the real screens are built (phase 1 only). */
export function PlaceholderScreen({
  title,
  body,
  links = [],
}: {
  title: string;
  body: string;
  links?: { href: Href; label: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[type.title, { color: colors.text }]}>{title}</Text>
      <Text style={[type.body, { color: colors.textMuted }]}>{body}</Text>
      {links.map((link) => (
        <Link key={link.label} href={link.href} style={[type.bodyStrong, styles.link, { color: colors.accent }]}>
          {link.label}
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, gap: spacing.md },
  link: { paddingVertical: spacing.md },
});
