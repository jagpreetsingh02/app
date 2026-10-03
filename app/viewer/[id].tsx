import { useLocalSearchParams } from 'expo-router';

import { ImageViewerScreen } from '../../src/ui/screens/ImageViewerScreen';

export default function ImageViewerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ImageViewerScreen id={id} />;
}
