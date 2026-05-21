import { CLEAR_COMMAND_RE, classifyConfirmation, normalizeEmoji } from './confirmation';

describe('normalizeEmoji', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeEmoji(undefined)).toBe('');
    expect(normalizeEmoji(null)).toBe('');
    expect(normalizeEmoji('')).toBe('');
  });

  it('strips variation selector U+FE0F', () => {
    expect(normalizeEmoji('✅️')).toBe('✅');
  });

  it('strips text-presentation selector U+FE0E', () => {
    expect(normalizeEmoji('✅︎')).toBe('✅');
  });

  it('trims whitespace', () => {
    expect(normalizeEmoji('  ✅  ')).toBe('✅');
  });

  it('passes through plain emoji unchanged', () => {
    expect(normalizeEmoji('❌')).toBe('❌');
  });
});

describe('classifyConfirmation', () => {
  describe('confirm', () => {
    it.each(['yes', 'y', 'yep', 'yeah', 'ok', 'okay', 'confirm', 'sure', 'do it', 'clear', '✅'])(
      'matches "%s"',
      (word) => {
        expect(classifyConfirmation(word)).toBe('confirm');
      },
    );

    it('matches with punctuation', () => {
      expect(classifyConfirmation('yes!')).toBe('confirm');
      expect(classifyConfirmation('OK.')).toBe('confirm');
    });

    it('matches case-insensitively', () => {
      expect(classifyConfirmation('YES')).toBe('confirm');
      expect(classifyConfirmation('Confirm')).toBe('confirm');
    });

    it('matches iMessage tapback fallback strings', () => {
      expect(classifyConfirmation('Liked "Clear this chat history?"')).toBe('confirm');
      expect(classifyConfirmation('Loved "msg"')).toBe('confirm');
      expect(classifyConfirmation('Emphasized "msg"')).toBe('confirm');
    });
  });

  describe('cancel', () => {
    it.each(['no', 'n', 'nope', 'cancel', 'stop', 'nevermind', 'never mind', '❌'])(
      'matches "%s"',
      (word) => {
        expect(classifyConfirmation(word)).toBe('cancel');
      },
    );

    it('matches Disliked tapback', () => {
      expect(classifyConfirmation('Disliked "msg"')).toBe('cancel');
    });
  });

  describe('unrecognized', () => {
    it.each(['hello', 'random text', "what's up", '👍', 'maybe later'])(
      'returns undefined for "%s"',
      (word) => {
        expect(classifyConfirmation(word)).toBeUndefined();
      },
    );

    it('does not match partial words', () => {
      // "yes" inside a longer string is not a standalone confirmation
      expect(classifyConfirmation('yes please clear it')).toBeUndefined();
    });
  });
});

describe('CLEAR_COMMAND_RE', () => {
  it.each(['/clear', 'clear', 'clear chat', 'reset', 'forget', 'forget everything', 'CLEAR', '  clear  '])(
    'matches "%s"',
    (cmd) => {
      expect(CLEAR_COMMAND_RE.test(cmd)).toBe(true);
    },
  );

  it.each(['cleared', 'reset the world', 'unclear', 'hello clear', 'forget about it'])(
    'rejects "%s"',
    (text) => {
      expect(CLEAR_COMMAND_RE.test(text)).toBe(false);
    },
  );
});
