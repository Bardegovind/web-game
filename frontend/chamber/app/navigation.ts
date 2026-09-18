/**
 * Where you can be in the chamber, and how that maps onto the bottom bar.
 *
 * Seven places, five buttons: Story, List and Reasons are reached through
 * More, so the bar never scrolls sideways on a phone.
 */

export type Screen = 'today' | 'chat' | 'moments' | 'letters' | 'story' | 'list' | 'reasons';
export type Section = 'today' | 'chat' | 'moments' | 'letters' | 'more';

export const SCREENS: ReadonlyArray<Screen> = ['today', 'chat', 'moments', 'letters', 'story', 'list', 'reasons'];

export const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'chat', label: 'Chat' },
    { id: 'moments', label: 'Moments' },
    { id: 'letters', label: 'Letters' },
    { id: 'more', label: 'More' },
];

const MORE: ReadonlyArray<Screen> = ['story', 'list', 'reasons'];

export const MORE_SCREENS: ReadonlyArray<{ id: Screen; label: string }> = [
    { id: 'story', label: 'Story' },
    { id: 'list', label: 'List' },
    { id: 'reasons', label: 'Reasons' },
];

export function sectionFor(screen: Screen): Section {
    return (MORE as ReadonlyArray<string>).includes(screen) ? 'more' : (screen as Section);
}

/** Which way the new screen should slide in: by position along the bar. */
export function directionBetween(from: Screen, to: Screen): -1 | 0 | 1 {
    const distance = SCREENS.indexOf(to) - SCREENS.indexOf(from);
    if (distance === 0) return 0;
    return distance > 0 ? 1 : -1;
}
