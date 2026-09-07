import {
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  passwordRejectionReason,
} from './credentials';

describe('normalizeEmail', () => {
  it('trims and lowercases so one account is one account', () => {
    expect(normalizeEmail('  Ahmet@Mail.COM ')).toBe('ahmet@mail.com');
  });

  /**
   * Turkish locale lowercasing turns 'I' into 'ı', which would make
   * "AHMETI@mail.com" a different account from "ahmeti@mail.com". E-mail is
   * ASCII-cased, so the locale is pinned to en-US.
   */
  it('does not apply Turkish dotless-i folding', () => {
    expect(normalizeEmail('AHMETI@MAIL.COM')).toBe('ahmeti@mail.com');
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'esnaf.dukkan@gmail.com', 'AHMET@MAIL.COM', '  ahmet@mail.com  '])(
    'accepts %p',
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );

  it.each(['', 'ahmet', 'ahmet@', '@mail.com', 'ahmet@mail', 'ahmet mail@x.com', 'a@b.c'])(
    'rejects %p',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe('passwordRejectionReason', () => {
  it('passes an ordinary password', () => {
    expect(passwordRejectionReason('kasa1907', 'ahmet@mail.com')).toBeNull();
  });

  it('rejects one that is too short', () => {
    expect(passwordRejectionReason('abc12')).toMatch(String(MIN_PASSWORD_LENGTH));
  });

  it.each(['123456', 'password', 'PAROLA', 'qwerty'])('rejects the guessable %p', (password) => {
    expect(passwordRejectionReason(password)).toMatch(/tahmin/);
  });

  /** Otherwise the "password" is written on the screen right above it. */
  it('rejects a password equal to the e-mail', () => {
    expect(passwordRejectionReason('Ahmet@mail.com', 'ahmet@MAIL.com')).toMatch(/e-posta/);
  });

  it('rejects whitespace posing as a password', () => {
    expect(passwordRejectionReason('        ')).toMatch(/boşluk/);
  });
});


