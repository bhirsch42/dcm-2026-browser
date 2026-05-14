import { describe, expect, it } from 'vitest';
import { buildShareLink, parseShareLink } from './share';

describe('parseShareLink', () => {
  it('returns null when ?s= is absent', () => {
    expect(parseShareLink('')).toBeNull();
    expect(parseShareLink('?q=foo')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(parseShareLink('?s=!!!not-base64!!!')).toBeNull();
  });

  it('returns null when payload is not a JSON array', () => {
    // base64url of '{"id":1}'
    const b64 = btoa('{"id":1}').replace(/=+$/, '');
    expect(parseShareLink(`?s=${b64}`)).toBeNull();
  });

  it('returns an empty array for the encoding of []', () => {
    expect(parseShareLink('?s=W10')).toEqual([]);
  });

  it('roundtrips a list of ids', () => {
    window.history.replaceState({}, '', '/');
    const ids = ['557065', '552580', '554130'];
    const url = buildShareLink(ids);
    expect(parseShareLink(new URL(url).search)).toEqual(ids);
  });

  it('coerces non-string ids to strings', () => {
    // Manually craft a payload of numbers — parser should coerce.
    const b64 = btoa('[1,2,3]').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(parseShareLink(`?s=${b64}`)).toEqual(['1', '2', '3']);
  });
});

describe('buildShareLink', () => {
  it('strips existing search and hash before appending ?s=', () => {
    window.history.replaceState({}, '', '/?foo=bar#/schedule');
    const url = buildShareLink(['1']);
    expect(url).not.toContain('foo=bar');
    expect(url).not.toContain('#');
    expect(url).toContain('?s=');
  });

  it('produces a URL the parser can decode', () => {
    window.history.replaceState({}, '', '/');
    const ids = ['a', 'b', 'c'];
    const url = buildShareLink(ids);
    expect(parseShareLink(new URL(url).search)).toEqual(ids);
  });
});
