import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '../../src/ui/screens/PlaceholderScreen';

export default function FileDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="File detail" body={`Entry ${id} (phase 3).`} />;
}
