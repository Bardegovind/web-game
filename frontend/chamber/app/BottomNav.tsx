import { motion, useReducedMotion } from 'framer-motion';
import { Ellipsis, House, Images, Mail, MessageCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SECTIONS, type Section } from './navigation';

const ICONS: Record<Section, LucideIcon> = {
    today: House,
    chat: MessageCircle,
    moments: Images,
    letters: Mail,
    more: Ellipsis,
};

/**
 * Five places, always in reach of a thumb. Replaces the row of text tabs that
 * scrolled sideways on a phone.
 *
 * A glass bar over the room. The place you are in glows rose, with a small
 * gradient pill beneath it that slides across when you move.
 */
export function BottomNav({
    active,
    badges,
    onSelect,
}: {
    active: Section;
    badges: Partial<Record<Section, number>>;
    onSelect: (section: Section) => void;
}) {
    const reduceMotion = useReducedMotion();

    return (
        <nav aria-label="Chamber sections" className="love-bar shrink-0 pb-[env(safe-area-inset-bottom)]">
            <ul className="mx-auto flex max-w-lg">
                {SECTIONS.map(({ id, label }) => {
                    const Icon = ICONS[id];
                    const isActive = active === id;
                    const badge = badges[id] ?? 0;

                    return (
                        <li key={id} className="flex-1">
                            <button
                                type="button"
                                aria-label={label}
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => onSelect(id)}
                                className={cn(
                                    'relative flex w-full flex-col items-center gap-1 pt-2.5 pb-3 font-display text-[0.7rem] font-medium transition-colors',
                                    isActive ? 'text-lamp' : 'text-dust hover:text-chalk'
                                )}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="bottom-nav-active"
                                        transition={
                                            reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }
                                        }
                                        className="love-fill-bright absolute inset-x-0 bottom-1 mx-auto h-1 w-6 rounded-full shadow-[0_0_12px_rgba(255,107,157,0.6)]"
                                    />
                                )}
                                <span className="relative">
                                    <Icon
                                        size={22}
                                        strokeWidth={isActive ? 2.2 : 1.8}
                                        aria-hidden="true"
                                        className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,107,157,0.55)]' : undefined}
                                    />
                                    {badge > 0 && (
                                        <span className="love-badge absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-semibold ring-2 ring-ink">
                                            {badge}
                                        </span>
                                    )}
                                </span>
                                {label}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
