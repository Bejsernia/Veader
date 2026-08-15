import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { StoredSource } from '../../domain/models';
import { libraryRepository } from '../../data/library-repository';
import { sourceRepository } from '../../data/source-repository';
import { deleteRemoteCredentials, saveRemoteCredentials } from '../../protocols';
import { useTheme } from '../../ui/theme';
import { PressableScale } from '../../ui/components/pressable-scale';
import { styles, layoutStyles, uiStyles } from '../../ui/legacy-styles';
import { IconButton } from '../shared/library-ui';

type SourceKind = '本地文件夹' | 'SMB' | 'FTP';
const SOURCE_DELETE_WIDTH = 60;

function SwipeableSourceRow({ source, isDark, onRemove, onToggle, onRename }: { source: StoredSource; isDark: boolean; onRemove: () => void; onToggle: (enabled: boolean) => void; onRename: () => void }) {
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan().activeOffsetX([-10, 10]).onUpdate(event => { translateX.value = Math.max(-SOURCE_DELETE_WIDTH, Math.min(0, event.translationX)); }).onEnd(() => { translateX.value = withSpring(translateX.value < -SOURCE_DELETE_WIDTH * 0.55 ? -SOURCE_DELETE_WIDTH : 0); });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  return <View style={styles.sourceSwipe}>
    <Pressable accessibilityRole="button" accessibilityLabel={`删除漫画源 ${source.name}`} style={[styles.sourceDelete, layoutStyles.sourceDeleteInset]} onPress={onRemove}><Ionicons name="trash-outline" size={21} color="#fff" /><Text style={styles.sourceDeleteText}>删除</Text></Pressable>
    <GestureDetector gesture={pan}><Animated.View style={animatedStyle}><PressableScale haptic="light" accessibilityRole="button" accessibilityLabel={`${source.name}，长按重命名，向左滑显示删除`} onLongPress={onRename} style={[styles.sourceCard, layoutStyles.sourceCardInset, isDark && styles.cardDark]}>
      <View style={[styles.sourceIcon, { backgroundColor: source.type === 'local' ? '#7257E7' : '#4D9E81' }]}><Ionicons name={source.type === 'local' ? 'folder' : 'server'} size={23} color="#fff" /></View>
      <View style={[styles.flex, { minWidth: 0 }]}><Text numberOfLines={2} ellipsizeMode="tail" style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>{source.name}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.meta, isDark && styles.textMutedDark]}>{source.type.toUpperCase()} · {source.endpoint}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.sourceStatus, isDark && uiStyles.sourceStatusDark]}>{source.bookCount} 部作品 · {source.type === 'local' ? '长按重命名' : '原生协议扫描'}</Text></View>
      <Switch accessibilityLabel={`启用 ${source.name}`} value={source.enabled} onValueChange={onToggle} trackColor={{ true: '#765BE8' }} />
    </PressableScale></Animated.View></GestureDetector>
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
  const { isDark } = useTheme();
   const refresh = () => sourceRepository.list().then(value => { setSources(value); setError(''); }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  useEffect(() => { refresh(); }, []);
   const chooseLocalFolder = async () => { setShowAdd(false); setLoading(true); setError(''); try { await libraryRepository.configureRoot(); await refresh(); onBooksChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setLoading(false); } };
  const add = async () => {
    if (kind === '本地文件夹') return chooseLocalFolder();
    if (!name.trim() || !address.trim()) return;
     try { await saveRemoteCredentials(address.trim(), username.trim(), password); await sourceRepository.save(kind.toLowerCase() as 'smb' | 'ftp', name.trim(), address.trim()); await refresh(); setName(''); setAddress(''); setUsername(''); setPassword(''); setShowAdd(false); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
   const toggle = async (source: StoredSource, enabled: boolean) => { try { await sourceRepository.setEnabled(source.id, enabled); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
   const remove = async (source: StoredSource) => { try { if (source.type !== 'local') await deleteRemoteCredentials(source.endpoint); await sourceRepository.remove(source.id); await refresh(); onBooksChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const startRename = (source: StoredSource) => { setEditName(source.name); setEditing(source); };
   const commitRename = async () => { if (!editing || !editName.trim()) return; try { await sourceRepository.rename(editing.id, editName); setEditing(null); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const renderSource = ({ item: source }: { item: StoredSource }) => <SwipeableSourceRow source={source} isDark={isDark} onRemove={() => remove(source)} onToggle={enabled => toggle(source, enabled)} onRename={() => startRename(source)} />;
  const header = <View><View style={[styles.header, layoutStyles.subpageHeader]}><IconButton name="chevron-back" label="返回" onPress={back} /><Text style={[styles.navTitle, isDark && styles.textPrimaryDark]}>漫画源</Text><View style={{ width: 44 }} /></View><View style={[styles.scanCard, isDark && styles.scanCardDark]}><View style={styles.scanIcon}><Ionicons name="library" size={22} color="#7257E7" /></View><View style={styles.flex}><Text style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>漫画统计</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>{sources.length} 个漫画源 · {sources.reduce((sum, source) => sum + source.bookCount, 0)} 部已扫描作品</Text></View>{loading && <ActivityIndicator color="#7257E7" />}</View><Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark]}>已添加 · {sources.length}</Text>{error && <Text style={layoutStyles.sourceError}>{error}</Text>}</View>;
  const footer = <Pressable accessibilityRole="button" accessibilityLabel="添加漫画源" style={({ pressed }) => [styles.dashedButton, pressed && styles.pressed]} onPress={() => setShowAdd(true)}><Ionicons name="add-circle-outline" size={21} color="#7257E7" /><Text style={styles.dashedText}>添加漫画源</Text></Pressable>;
  return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}><FlatList data={sources} keyExtractor={source => String(source.id)} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.page, isDark && styles.pageDark]} ListHeaderComponent={header} renderItem={renderSource} ListFooterComponent={footer} ListEmptyComponent={<View style={styles.empty}><Ionicons name="folder-open-outline" size={36} color="#B2ADB7" /><Text style={[styles.meta, isDark && styles.textMutedDark]}>尚未添加任何漫画源</Text></View>} />
    <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}><Pressable accessibilityRole="button" accessibilityLabel="关闭添加漫画源" style={styles.modalShade} onPress={() => setShowAdd(false)} /><View style={[styles.sheet, isDark && styles.sheetDark]}><View style={styles.sheetHandle} /><Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>添加漫画源</Text><Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark]}>来源类型</Text><View style={[styles.segment, isDark && uiStyles.segmentDark]}>{(['本地文件夹', 'SMB', 'FTP'] as SourceKind[]).map(v => <Pressable accessibilityRole="button" key={v} onPress={() => setKind(v)} style={[styles.segmentItem, kind === v && styles.segmentActive, isDark && kind === v && uiStyles.segmentActiveDark]}><Text style={[styles.segmentText, kind === v && styles.segmentTextActive, isDark && kind !== v && uiStyles.segmentTextDark]}>{v}</Text></Pressable>)}</View>{kind === '本地文件夹' ? <><Text style={[styles.modalHelp, isDark && styles.textMutedDark]}>将打开系统目录选择器。授权后会扫描其中的 EPUB、MOBI 和 PDF。</Text><Pressable accessibilityRole="button" style={styles.primaryButton} onPress={chooseLocalFolder}><Ionicons name="folder-open" size={20} color="#fff" /><Text style={styles.primaryText}>选择系统文件夹</Text></Pressable></> : <><TextInput value={name} onChangeText={setName} placeholder="显示名称" placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} style={[styles.input, isDark && uiStyles.inputDark]} /><TextInput value={address} onChangeText={setAddress} placeholder={kind === 'SMB' ? 'smb://服务器/共享目录' : 'ftp://服务器/目录'} placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} autoCapitalize="none" style={[styles.input, isDark && uiStyles.inputDark]} /><TextInput value={username} onChangeText={setUsername} placeholder="用户名（可留空使用匿名）" placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} autoCapitalize="none" style={[styles.input, isDark && uiStyles.inputDark]} /><TextInput value={password} onChangeText={setPassword} placeholder="密码" placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} secureTextEntry style={[styles.input, isDark && uiStyles.inputDark]} /><Text style={[styles.modalHelp, isDark && styles.textMutedDark]}>账号密码使用 Android Keystore 加密保存，不写入漫画数据库。</Text><Pressable accessibilityRole="button" style={[styles.primaryButton, (!name.trim() || !address.trim()) && { opacity: .45 }]} onPress={add}><Text style={styles.primaryText}>测试并保存</Text></Pressable></>}</View></Modal>
    <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}><Pressable accessibilityRole="button" accessibilityLabel="关闭重命名" style={styles.modalShade} onPress={() => setEditing(null)} /><View style={[styles.sheet, isDark && styles.sheetDark]}><View style={styles.sheetHandle} /><Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>重命名漫画源</Text><TextInput value={editName} onChangeText={setEditName} autoFocus placeholder="漫画源名称" placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} style={[styles.input, isDark && uiStyles.inputDark]} /><Pressable accessibilityRole="button" style={[styles.primaryButton, !editName.trim() && { opacity: .45 }]} onPress={commitRename}><Text style={styles.primaryText}>保存名称</Text></Pressable></View></Modal>
  </SafeAreaView>;
}


export { Sources };
