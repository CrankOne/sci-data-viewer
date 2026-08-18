Block diagram module
====================

A block diagram module is intended to visualize structured graphs with limited
subset of UML notation.

Purpose
-------

Read-only visualization of finite state machine graphs, direct acyclic graphs,
connectivity maps, object diagrams, etc, supporting interactivity for
entities inspection.

Design
------

Built on top of dagrejs (TODO: link to https://github.com/dagrejs/dagre here)
this module translates JSON data with nodes and edges into connectivity graph
mirroring limited subset of original graphviz's grammar.

