import { PlaceholderScreen } from '../src/ui/screens/PlaceholderScreen';

export default function ArchiveRoute() {
  return (
    <PlaceholderScreen
      title="Digital Archive"
      body="Database opened and storage folders are ready. Import arrives in phase 2."
      links={[
        { href: '/tags', label: 'Tags' },
        { href: '/integrity', label: 'Integrity' },
        { href: '/file/example', label: 'File detail (example)' },
      ]}
    />
  );
}
