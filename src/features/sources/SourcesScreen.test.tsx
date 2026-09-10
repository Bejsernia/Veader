import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SwipeableSourceRow } from './SourcesScreen';
import type { StoredSource } from '../../domain/models';
jest.mock('../../ui/theme', () => ({ useTheme: () => ({ isDark: false, reducedMotion: true }) }));
jest.mock('../../data/library-repository', () => ({}));
jest.mock('../../data/source-repository', () => ({}));
jest.mock('../../protocols', () => ({}));

it('keeps the source switch outside touch-blocking content and preserves row actions', () => {
  const toggle = jest.fn(); const rename = jest.fn(); const remove = jest.fn();
  const source = { id: 1, name: '漫画', type: 'local', endpoint: 'content://books', enabled: true, bookCount: 2 } as StoredSource;
  const screen = render(<SwipeableSourceRow source={source} isDark={false} onToggle={toggle} onRename={rename} onRemove={remove} />);
  const control = screen.getByLabelText('启用 漫画');
  for (let parent = control.parent; parent; parent = parent.parent) expect(parent.props.pointerEvents).not.toBe('none');
  fireEvent(control, 'valueChange', false);
  expect(toggle).toHaveBeenCalledWith(false);
  fireEvent(screen.getByLabelText('漫画，长按重命名，向左滑显示删除'), 'longPress');
  expect(rename).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText('删除漫画源 漫画'));
  expect(remove).toHaveBeenCalledTimes(1);
});
