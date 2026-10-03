import { useLocalSearchParams } from 'expo-router';

import { FileDetailScreen } from '../../src/ui/screens/FileDetailScreen';

export default function FileDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FileDetailScreen id={id} />;
}
