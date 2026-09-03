# Third-party notices

## OpenUtau

Japanese CV/VCV/CVVC alias behavior and lookup conventions were consulted from OpenUtau's
Japanese legacy phonemizers.

OpenUtau is distributed under the MIT License. Copyright (c) 2014 StAkira and contributors.
This project does not embed OpenUtau or perform singer/oto lookup.

Source: https://github.com/openutau/OpenUtau

## Cephome

The Amadeus language-package lifecycle, stable phone-boundary editing pattern, and the general
idea of vowel-anchored timing were compared against Cephome's first-class `lang.vi.vlp` plugin.
The Sinsy context row structure in `src/sinsy.ts` is adapted to the same host-facing shape while
leaving Japanese-unknown linguistic fields unset (`xx`) rather than copying Vietnamese metadata.

Cephome is licensed under Apache License 2.0. Copyright 2026 stdpi.
A copy of Apache License 2.0 is included at `licenses/Apache-2.0.txt`.

Source: https://github.com/hUwUtao/cephome
