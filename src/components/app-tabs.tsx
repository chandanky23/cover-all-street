import { NativeTabs } from 'expo-router/native-tabs';
import { brand } from '@/constants/duppyTheme';

// App chrome always uses the Duppy brand tokens (plan.md V5-B).
export default function AppTabs() {

  return (
    <NativeTabs
      backgroundColor={brand.cream}
      indicatorColor={brand.blush}
      rippleColor={brand.lavender}
      iconColor={{ default: brand.sage, selected: brand.forest }}
      labelStyle={{
        default: { color: brand.sage },
        selected: { color: brand.forest },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="insights">
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/settings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
