import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';

export function TabBarIcon(
  props: { name: ComponentProps<typeof Ionicons>['name']; color: string }
) {
  return <Ionicons size={24} style={{ marginBottom: -2 }} {...props} />;
}
