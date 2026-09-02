UI Layout Rules
===============

UI must be optimized for the desktop and offer a rather condensed view, focused
on the data, even by the price of active UI elements' size making it less
suitable for touchscreen devices.

Most of the UI sizes are defined as its main font which is based on the root
font size and the size hierarchy of levels:

1. Panels (``--up1``)
2. Subpanels (``--u0``)
3. Frames (``--um1``)
4. Inputs (``--u0``)

Note that, the 1st level panel font size is actually 1.25rem (i.e. only
immediate p/span etc elements are of that size). This choice is delibirate
since direct writings on the panel are rare and 80% of the text shown resides
at subpanels.

At the every level the following text markup is anticipated:

1. Header (1.25em)
2. Main text or label (1em)
3. Secondary text (.75em)
4. Input (1em)

For instance the faint text describing the input meaning within a frame can
be 0.75*0.75 = 0.5625rem.

Line height is always dimensonless, and, unles locally overridden is 1.25.



