import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareBanner } from './ShareBanner';
import { useStore } from '../state';
import type { Show } from '../types';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

function makeShow(id: string, title: string, overrides: Partial<Show> = {}): Show {
  return {
    id,
    slug: `slug-${id}`,
    title,
    url: `https://example.test/show/${id}`,
    image: '',
    datetime: `2026-06-10T${10 + Number(id.charCodeAt(0) % 12)}:00:00`,
    weekday: 'Wednesday',
    dateLabel: 'Wed, Jun 10',
    timeLabel: '8:00 PM',
    venue: 'venue-a',
    venueName: 'Venue A',
    categories: [],
    categoryNames: [],
    excerpt: '',
    performers: [],
    ...overrides,
  };
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function setShareUrl(ids: string[]) {
  window.history.replaceState({}, '', `/?s=${b64url(JSON.stringify(ids))}`);
}

function seed(shows: Show[], saved: string[]) {
  useStore.setState({ shows, saved: new Set(saved) });
}

beforeEach(() => {
  navigateMock.mockReset();
  useStore.setState({ shows: [], saved: new Set() });
});

describe('ShareBanner', () => {
  it('renders nothing without ?s=', () => {
    const { container } = render(<ShareBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when ?s= encodes an empty array', () => {
    setShareUrl([]);
    const { container } = render(<ShareBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a malformed ?s= param', () => {
    window.history.replaceState({}, '', '/?s=!!!');
    const { container } = render(<ShareBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Import N shows" wording when the user has no saved shows', () => {
    seed([makeShow('a', 'A')], []);
    setShareUrl(['a']);
    render(<ShareBanner />);
    expect(screen.getByText(/schedule shared with you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import 1 show/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replace/i })).not.toBeInTheDocument();
  });

  it('merges (does not replace) when "Add" is clicked and routes to /schedule', async () => {
    const user = userEvent.setup();
    seed(
      [makeShow('a', 'A'), makeShow('b', 'B'), makeShow('c', 'C')],
      ['c'],
    );
    setShareUrl(['a', 'b']);
    render(<ShareBanner />);
    await user.click(screen.getByRole('button', { name: /add 2 to my schedule/i }));
    expect([...useStore.getState().saved].sort()).toEqual(['a', 'b', 'c']);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/schedule' });
    // ?s= is stripped from the URL.
    expect(window.location.search).toBe('');
  });

  it('shows overlap count when some shared ids are already saved', () => {
    seed([makeShow('a', 'A'), makeShow('b', 'B')], ['a']);
    setShareUrl(['a', 'b']);
    render(<ShareBanner />);
    expect(screen.getByText(/1 already in your schedule/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add 1 to my schedule/i })).toBeInTheDocument();
  });

  it('Replace confirms before discarding existing shows', async () => {
    const user = userEvent.setup();
    seed([makeShow('a', 'A'), makeShow('c', 'C')], ['c']);
    setShareUrl(['a']);
    render(<ShareBanner />);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: /replace/i }));
    expect([...useStore.getState().saved]).toEqual(['c']); // unchanged
    expect(navigateMock).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /replace/i }));
    expect([...useStore.getState().saved]).toEqual(['a']); // replaced
    expect(navigateMock).toHaveBeenCalledWith({ to: '/schedule' });

    confirmSpy.mockRestore();
  });

  it('preview toggle reveals and hides show titles', async () => {
    const user = userEvent.setup();
    seed([makeShow('a', 'Alpha Show'), makeShow('b', 'Beta Show')], []);
    setShareUrl(['a', 'b']);
    render(<ShareBanner />);
    expect(screen.queryByText(/Alpha Show/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText(/Alpha Show/)).toBeInTheDocument();
    expect(screen.getByText(/Beta Show/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText(/Alpha Show/)).not.toBeInTheDocument();
  });

  it('preview marks already-saved entries', async () => {
    const user = userEvent.setup();
    seed([makeShow('a', 'Alpha Show'), makeShow('b', 'Beta Show')], ['a']);
    setShareUrl(['a', 'b']);
    render(<ShareBanner />);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    const alpha = items.find((li) => li.textContent?.includes('Alpha Show'));
    const beta = items.find((li) => li.textContent?.includes('Beta Show'));
    expect(alpha?.textContent?.toLowerCase()).toContain('saved');
    expect(beta?.textContent?.toLowerCase()).not.toContain('saved');
  });

  it('preview shows fallback text when shared ids no longer exist in the data', async () => {
    const user = userEvent.setup();
    seed([], []);
    setShareUrl(['gone-1', 'gone-2']);
    render(<ShareBanner />);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(
      screen.getByText(/aren't in the current data/i),
    ).toBeInTheDocument();
  });

  it('dismiss clears banner, removes ?s=, and does not navigate', async () => {
    const user = userEvent.setup();
    seed([makeShow('a', 'A')], []);
    setShareUrl(['a']);
    const { container } = render(<ShareBanner />);
    expect(window.location.search).toContain('s=');
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(window.location.search).toBe('');
    expect(container.firstChild).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
    // Saved set untouched.
    expect([...useStore.getState().saved]).toEqual([]);
  });

  it('hides the "Add" button when every shared id is already saved, but still offers Replace', () => {
    seed([makeShow('a', 'A')], ['a']);
    setShareUrl(['a']);
    render(<ShareBanner />);
    expect(screen.queryByRole('button', { name: /^add /i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.getByText(/1 already in your schedule/i)).toBeInTheDocument();
  });
});
