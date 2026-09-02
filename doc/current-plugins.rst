:orphan:

Active Plugin Development
=========================

Plugins are *usually* available in running sessions are either demo showrooms
for tests, or one of the two group the viewer is currently streamlining to:

- **NA64 waveform fitting**. Software library for numeric minimization of 1D
  function models towards the sampling ADC measurements results in a JSON data
  in one of its development fixtures. The lib consists of generic framework
  (UMFF, not directly relevant to this project) and subject-specific
  implementation of UMFF's extension points. This data defines a layered visual
  representations: the finite state machine graph depicting model evaluation
  during the fitting, the functions to be plotted corresponding to each state,
  the physical results JSON objects corresponding to individual pulses
  recognized on the plot, and a journal logging numeric procedure convergence.
  The input JSON is being prototyped. The detailed note on plugin is at the
  `viewer/plugin/NOTES.rst`.
- **COMPASS Setup Viewer** visualizes experimental setup of COMPASS (NA58)
  experiment in 3D providing rich information on the detector geometry,
  tracking and alignment results. Exposes few data sources in two plugins. The
  whole system is rather mature. Perfect testing environment for 3D graphics
  and streamlining the app as exposes rather large amount of information.
  The code is asumed to be self-documented and can

A *very important* subject is separated layers of genericity that must be
respected unless explicitly asked for temporary stubs:

1. The viewer is subject-agnostic (at both, client and server part, but not
   the plugins).
2. The plugin is subject-specific.
3. Subject-specific app contributes to a plugin in way (e.g. NA64 waveform
   fitting routines provide an input for NA64 plugin), but has to be
   self-sufficient without a plugin.
4. Another (again) generic solution may facilitate subject-specific solution
   (e.g. UMFF framework providing data-agnostic OO framework for waveform
   fitting knows nothing about waveforms, dealing with them as abstract
   "models").

For instance:
- no ad-hoc scaffolding for waveforms specifically in the client code;
- no comments mentioning viewer in UMFF code;
- the viewer should be useful without plugins at all;
- pulse's or hit's datum is considered just as some generic JS Object at the
  client side.

