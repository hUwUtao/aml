# CeVIO CCS and CCST import research

CeVIO Creative Studio and CeVIO AI save projects as `.ccs`; saving a track for reuse creates `.ccst`. These are XML documents with distinct root elements: CCS uses `Scenario`, while CCST uses `Definition`. The project embeds song and talk units; only `SingerSong` units are imported here.

Song units store tempo points as `Tempo/Sound` (`Clock`, `Tempo`), meter changes as `Beat/Time` (`Clock`, `Beats`, `BeatType`), and notes as `Score/Note` (`Clock`, `Duration`, `PitchStep`, `PitchOctave`, `Lyric`, plus articulation attributes). The reference reader defines 960 ticks per quarter and maps note pitch to `12 * (PitchOctave + 1) + PitchStep`. The importer carries the original unit, parameter curves (including `LogF0`), and score metadata in AML extensions so tuning and other CeVIO-specific data remain available.

Sources:

- [CeVIO Creative Studio user guide](https://cevio.jp/guide/cevio_cs7/operation/menu/) documents CCS projects and reusable CCST track saves.
- [LibSasara CCS reader](https://github.com/InuInu2022/LibSasara/blob/master/LibSasara/SasaraCcs.cs) distinguishes the `Scenario` and `Definition` roots.
- [LibSasara song model](https://github.com/InuInu2022/LibSasara/blob/master/LibSasara/Model/SongUnit.cs) and [clock and pitch utilities](https://github.com/InuInu2022/LibSasara/blob/master/LibSasara/LibSasaraUtil.cs) document song fields, 960 PPQ timing, and pitch conversion.

Import scope: SingerSong units, note lyrics and pitches, tempo and meter maps, and exact source preservation in extensions. `StartTime` is converted to a tick offset using the unit tempo map. CeVIO `LogF0` and other sampled parameters are retained raw; their sample timing/value conversion is not inferred.
