import CodexianPlugin from '../../../src/main';

describe('Inline edit command registration', () => {
  it('registers inline edit command on load', async () => {
    const plugin = new CodexianPlugin({} as never, {} as never);

    const addCommand = jest.fn();
    const addRibbonIcon = jest.fn();
    const registerView = jest.fn();
    const addSettingTab = jest.fn();
    const saveData = jest.fn().mockResolvedValue(undefined);
    const loadData = jest.fn().mockResolvedValue(undefined);
    const addStatusBarItem = jest.fn(() => ({
      setText: jest.fn(),
      addEventListener: jest.fn(),
    }));

    const app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf: jest.fn().mockReturnValue(null),
        revealLeaf: jest.fn().mockResolvedValue(undefined),
      },
      vault: {
        adapter: { basePath: '/tmp/vault' },
      },
    };

    Object.assign(plugin, {
      app,
      addCommand,
      addRibbonIcon,
      registerView,
      addStatusBarItem,
      addSettingTab,
      loadData,
      saveData,
    });

    plugin.onload();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const commandIds = addCommand.mock.calls
      .map((call: unknown[]) => (call[0] as { id?: string }).id)
      .filter((id: string | undefined): id is string => Boolean(id));

    expect(commandIds).toEqual(
      expect.arrayContaining([
        'open',
        'inline-edit',
        'new-thread',
        'add-selection-context',
        'add-file-context',
        'implement-todo',
      ])
    );
  });
});
