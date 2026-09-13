import { motion } from 'framer-motion';
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
    return (
        <nav
            aria-label="Chamber sections"
            className="shrink-0 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
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
                                    'relative flex w-full flex-col items-center gap-1 py-2.5 text-[0.68rem] transition-colors',
                                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="bottom-nav-active"
                                        className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
                                    />
                                )}
                                <span className="relative">
                                    <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                                    {badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground">
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
