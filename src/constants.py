"""
src/constants.py
================
Shared constants used across the Python tooling and mirrored in the
JavaScript front-end (docs/js/config.js).

Keeping constants in one place means a single edit propagates to every
script that imports from this module.
"""

# ---------------------------------------------------------------------------
# Greek-alphabet ordering
# Used to sort pledge classes chronologically (alpha < beta < … < omega <
# alpha_alpha < alpha_beta < …).
# ---------------------------------------------------------------------------

GREEK_ALPHABET = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho",
    "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
]

# Map letter name → 0-based index for O(1) lookup during sorting.
GREEK_TO_INDEX = {letter: i for i, letter in enumerate(GREEK_ALPHABET)}

# ---------------------------------------------------------------------------
# Lin color palette
# Pastel hex colors assigned to each lin.  Must be kept in sync with the
# LIN_COLORS object in docs/js/config.js.
# ---------------------------------------------------------------------------

LIN_COLORS = {
    "pgn":                               "#E8E8E8",  # default / unassigned — light gray
    "watergates":                        "#A8C5F0",  # light royal blue
    "titans":                            "#F5A0A0",  # light crimson / salmon
    "bluechips":                         "#A0D4FF",  # light dodger blue
    "hello_kitties":                     "#FFB6D9",  # light pink
    "drunken_ducks":                     "#FFEB99",  # light gold
    "rockstars":                         "#D8A0F0",  # light violet
    "gods":                              "#90D890",  # light forest green
    "bluechips (adopted)":               "#C5E8F7",  # lighter sky blue
    "drunken_ducks (former bluechips)":  "#C5E8B0",  # light sage (blue × gold blend)
    "dtf":                               "#FFD4A8",  # light peach / orange
}
