import { selectLruFilesToTrim } from './cache-policy';

describe('cache LRU policy', () => {
  it('removes the oldest files until the configured byte limit is met', () => {
    const files = [
      { uri: 'new', size: 40, modified: 30 },
      { uri: 'old', size: 40, modified: 10 },
      { uri: 'middle', size: 40, modified: 20 },
    ];
    expect(selectLruFilesToTrim(files, 80).map(item => item.uri)).toEqual(['old']);
    expect(selectLruFilesToTrim(files, 40).map(item => item.uri)).toEqual(['old', 'middle']);
  });
});
