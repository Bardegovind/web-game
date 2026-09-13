import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';

import type { Screen } from './navigation';

/** How far a screen travels as it arrives: a nudge, not a page turn. */
const DISTANCE = 24;

const variants: Variants = {
    enter: (distance: number) => ({ x: distance, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (distance: number) => ({ x: -distance, opacity: 0 }),
};

/**
 * Slides the new screen in from the side of the tab that was tapped, while the
 * old one slides out the other way. `custom` is passed to AnimatePresence as
 * well as the child so the leaving screen uses the new direction, not the one
 * it arrived with. With reduced motion on, screens only fade.
 */
export function ScreenStage({
    screen,
    direction,
    children,
}: {
    screen: Screen;
    direction: -1 | 0 | 1;
    children: ReactNode;
}) {
    const reduceMotion = useReducedMotion();
    const distance = reduceMotion ? 0 : direction * DISTANCE;

    return (
        <AnimatePresence initial={false} custom={distance}>
            <motion.div
                key={screen}
                custom={distance}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 flex min-h-0 flex-col"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
