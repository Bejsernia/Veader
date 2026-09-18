import { Toggle } from '../../ui/components/toggle';
import { Ionicons } from '@expo/vector-icons';
import React,{ useEffect,useState } from 'react';
import { ActivityIndicator,FlatList,Pressable,ScrollView,Text,View } from 'react-native';
import { Gesture,GestureDetector } from 'react-native-gesture-handler';
import Animated,{ useAnimatedStyle,useSharedValue,withSpring } from 'react-native-reanimated';
import { libraryRepository } from '../../data/library-repository';
import { sourceRepository } from '../../data/source-repository';
import type { StoredSource } from '../../domain/models';
import { deleteRemoteCredentials,saveRemoteCredentials } from '../../protocols';
import { PressableScale } from '../../ui/components/pressable-scale';
import { useScreenStyles } from '../../ui/screen-styles';
import { useTheme } from '../../ui/theme';
import { IconButton } from '../shared/library-ui';

import { useWindowDimensions } from 'react-native';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { Button } from '../../ui/components/button';
import { EmptyState } from '../../ui/components/empty-state';
import { Screen } from '../../ui/components/screen';
import { ScreenHeader } from '../../ui/components/screen-header';
import { SegmentedControl } from '../../ui/components/segmented-control';
import { TextField } from '../../ui/components/text-field';
import { getGridLayout } from '../../ui/layout';
type SourceKind = '本地文件夹' | 'SMB' | 'FTP';
const SOURCE_DELETE_WIDTH = 60;

export function SwipeableSourceRow({ source, isDark, onRemove, onToggle, onRename }: { source: StoredSource; isDark: boolean; onRemove: () => void; onToggle: (enabled: boolean) => void; onRename: () => void }) {
  const { styles, layoutStyles, uiStyles } = useScreenStyles();
  const { tokens } = useTheme();
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan().activeOffsetX([-10, 10]).onUpdate(event => { translateX.value = Math.max(-SOURCE_DELETE_WIDTH, Math.min(0, event.translationX)); }).onEnd(() => { translateX.value = withSpring(translateX.value < -SOURCE_DELETE_WIDTH * 0.55 ? -SOURCE_DELETE_WIDTH : 0); });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  return <View style={styles.sourceSwipe}>
    <Pressable accessibilityRole="button" accessibilityLabel={`删除漫画源 ${source.name}`} style={[styles.sourceDelete, layoutStyles.sourceDeleteInset]} onPress={onRemove}><Ionicons name="trash-outline" size={21} color={tokens.colors.onPrimary} /><Text style={styles.sourceDeleteText}>删除</Text></Pressable>
    <GestureDetector gesture={pan}><Animated.View style={[styles.sourceCard, layoutStyles.sourceCardInset, isDark && styles.cardDark, animatedStyle]}><PressableScale haptic="light" accessibilityRole="button" accessibilityLabel={`${source.name}，长按重命名，向左滑显示删除`} onLongPress={onRename} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={[styles.sourceIcon, { backgroundColor: tokens.colors.selectedContainer }]}><Ionicons name={source.type === 'local' ? 'folder' : 'server'} size={23} color={tokens.colors.onSelectedContainer} /></View>
      <View style={[styles.flex, { minWidth: 0 }]}><Text numberOfLines={2} ellipsizeMode="tail" style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>{source.name}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.meta, isDark && styles.textMutedDark]}>{source.type.toUpperCase()} · {source.endpoint}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.sourceStatus, isDark && uiStyles.sourceStatusDark]}>{source.bookCount} 部作品 · {source.type === 'local' ? '长按重命名' : '原生协议扫描'}</Text></View>
    </PressableScale><Toggle accessibilityLabel={`启用 ${source.name}`} value={source.enabled} onValueChange={onToggle} /></Animated.View></GestureDetector>
  </View>;
}

function Sources({ back, onBooksChanged }: { back: () => void; onBooksChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<SourceKind>('本地文件夹');
  const [sources, setSources] = useState<StoredSource[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<StoredSource | null>(null);
  const [editName, setEditName] = useState('');
  const { isDark, tokens } = useTheme();
  const { width } = useWindowDimensions();
   const refresh = () => sourceRepository.list().then(value => { setSources(value); setError(''); }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  useEffect(() => { refresh(); }, []);
   const chooseLocalFolder = async () => { setShowAdd(false); setLoading(true); setError(''); try { await libraryRepository.configureRoot(); await refresh(); onBooksChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setLoading(false); } };
  const add = async () => {
    if (kind === '本地文件夹') return chooseLocalFolder();
    if (!name.trim() || !address.trim()) return;
     setLoading(true); setError('');
     try { await saveRemoteCredentials(address.trim(), username.trim(), password); await sourceRepository.save(kind.toLowerCase() as 'smb' | 'ftp', name.trim(), address.trim()); await refresh(); setName(''); setAddress(''); setUsername(''); setPassword(''); setShowAdd(false); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setLoading(false); }
  };
   const toggle = async (source: StoredSource, enabled: boolean) => { try { await sourceRepository.setEnabled(source.id, enabled); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
   const remove = async (source: StoredSource) => { try { if (source.type !== 'local') await deleteRemoteCredentials(source.endpoint); await sourceRepository.remove(source.id); await refresh(); onBooksChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const startRename = (source: StoredSource) => { setEditName(source.name); setEditing(source); };
   const commitRename = async () => { if (!editing || !editName.trim()) return; try { await sourceRepository.rename(editing.id, editName); setEditing(null); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const renderSource = ({ item: source }: { item: StoredSource }) => <SwipeableSourceRow source={source} isDark={isDark} onRemove={() => remove(source)} onToggle={enabled => toggle(source, enabled)} onRename={() => startRename(source)} />;
  const header = <View><ScreenHeader title="漫画源" back={back} subtitle={sources.length + ' 个漫画源 · ' + sources.reduce((sum, source) => sum + source.bookCount, 0) + ' 部已扫描作品'} />
    {loading && <ActivityIndicator color={tokens.colors.primary} />}
    {!!error && !showAdd && !editing && <Text accessibilityLiveRegion="polite" style={{ color: tokens.colors.danger, marginBottom: 16 }}>{error}</Text>}
  </View>;
  return <Screen><FlatList data={sources} keyExtractor={source => String(source.id)} contentContainerStyle={{ padding: 16, paddingHorizontal: getGridLayout(width).pageInset }} ListHeaderComponent={header} renderItem={renderSource}
    ListFooterComponent={<Button label="添加漫画源" variant="secondary" icon="add-circle-outline" onPress={() => { setError(''); setShowAdd(true); }} />}
    ListEmptyComponent={<EmptyState icon="folder-open-outline" title="尚未添加漫画源" description="选择本地文件夹，或添加 SMB、FTP 远程目录。" />} />
    <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <ScreenHeader title="添加漫画源" trailing={<IconButton name="close" label="关闭添加漫画源" onPress={() => setShowAdd(false)} />} />
        <SegmentedControl label="来源类型" value={kind} onChange={setKind} options={(['本地文件夹', 'SMB', 'FTP'] as SourceKind[]).map(value => ({ value, label: value }))} />
        {kind === '本地文件夹' ? <>
          <Text style={[tokens.typography.body, { color: tokens.colors.mutedText, marginBottom: 16 }]}>将打开系统目录选择器。授权后会扫描其中的 EPUB、MOBI 和 PDF。</Text>
          <Button label="选择系统文件夹" icon="folder-open-outline" onPress={chooseLocalFolder} loading={loading} />
        </> : <>
          <TextField label="显示名称" value={name} onChangeText={setName} />
          <TextField label="服务器目录" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} placeholder={kind === 'SMB' ? 'smb://服务器/共享目录' : 'ftp://服务器/目录'} />
          <TextField label="用户名（可留空使用匿名）" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <TextField label="密码" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          <Button label="保存漫画源" onPress={add} disabled={!name.trim() || !address.trim()} loading={loading} />
        </>}
        {!!error && <Text accessibilityLiveRegion="polite" style={[tokens.typography.body, { color: tokens.colors.danger, marginTop: 12 }]}>{error}</Text>}
      </ScrollView>
    </BottomSheet>
    <BottomSheet visible={editing !== null} onClose={() => setEditing(null)}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <ScreenHeader title="重命名漫画源" trailing={<IconButton name="close" label="关闭重命名" onPress={() => setEditing(null)} />} />
        <TextField label="漫画源名称" value={editName} onChangeText={setEditName} autoFocus />
        <Button label="保存名称" onPress={commitRename} disabled={!editName.trim()} />
        {!!error && <Text style={{ color: tokens.colors.danger }}>{error}</Text>}
      </ScrollView>
    </BottomSheet>
  </Screen>;
}
export { Sources };
