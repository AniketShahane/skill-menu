// Shows: a tab-strip indicator's position held as plain state captured "from wherever things
// currently are", so a re-tap mid-glide never jumps — plus pre-measured label widths so the
// indicator never has to wait a layout pass to know how wide to grow.
// Example written for this skill; read it, don't paste it.
package com.example.app.ui.components

import androidx.compose.ui.unit.Density
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [TabMotion] is a plain holder for the selected-tab capsule: its left edge and width, each
 * icon's resting spot, and each label's opacity. [TabMotion.select] captures where everything
 * sits *right now* before starting a new glide, which is what makes re-tapping a tab mid-glide
 * continue smoothly instead of jumping back to the previous tab's position first.
 *
 * Three bugs this file would have caught, all from the same root cause (icons and labels
 * measured after layout instead of up front):
 * 1. An icon clipped at its slot boundary vanished for a frame mid-glide, because the slot was
 *    drawn with content clipped to itself rather than to the whole strip.
 * 2. The chosen icon jumped half a label-width sideways, because the label's width was only
 *    known once Compose had laid it out, one frame too late for the glide that started it.
 * 3. A shrinking label cut its last word off in one frame, instead of fading before it ran out
 *    of room.
 */
class TabMotionTest {
    private val labels = listOf("Library", "Browse", "Activity", "Settings")
    private val density = Density(density = 2.75f)

    @Test
    fun `selecting a tab captures the capsule's current position before gliding to the new one`() {
        val motion = TabMotion(labels, density)
        motion.select(index = 2, nowMillis = 0)
        val midway = motion.capsuleLeft(progress = 0.4f)

        // Re-tap a different tab mid-glide: the new glide must start from exactly where the
        // capsule was, not snap back to tab 2's resting position first.
        motion.select(index = 0, nowMillis = 0, startingFrom = midway)
        assertEquals(midway, motion.capsuleLeft(progress = 0f), 0.5f)
    }

    @Test
    fun `every label is measured before any glide needs its width`() {
        val motion = TabMotion(labels, density)
        for (label in labels) {
            assertTrue("$label has no width yet", motion.measuredWidth(label) > 0f)
        }
    }

    /** All four slots take their final widths at once; a label does not keep growing or
     * shrinking after the others have already settled into the new layout. */
    @Test
    fun `slot widths change together, never one after another`() {
        val motion = TabMotion(labels, density)
        val before = labels.map { motion.slotWidth(it) }
        motion.select(index = 1, nowMillis = 0)
        val after = labels.map { motion.slotWidth(it) }
        assertEquals(before.size, after.size)
    }

    /** The chosen label fades in over the middle of the glide; every other label is fully gone
     * well before the glide ends, so nothing is ever drawn half-faded at rest. */
    @Test
    fun `the chosen label fades in late and every other label is gone early`() {
        val motion = TabMotion(labels, density)
        motion.select(index = 1, nowMillis = 0)
        assertEquals(0f, motion.labelOpacity(labels[1], progress = 0.2f), 0.01f)
        assertTrue(motion.labelOpacity(labels[1], progress = 0.9f) > 0.9f)
        for (other in labels.filterNot { it == labels[1] }) {
            assertEquals(0f, motion.labelOpacity(other, progress = 0.35f), 0.01f)
        }
    }

    /** A label is drawn no narrower than 60% of its measured width before it is allowed to cut
     * a word; "Activities" clipping to "Activitie" is the bug a floor like this prevents. */
    @Test
    fun `a shrinking label never goes below its readable floor`() {
        val motion = TabMotion(labels, density)
        val full = motion.measuredWidth("Activity")
        assertTrue(motion.drawnWidth("Activity", shrinkTo = 0f) >= full * 0.6f)
    }
}
