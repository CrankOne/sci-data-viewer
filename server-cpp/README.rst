Synchroneous C++ Server
-----------------------

This dir contains C++ project building a library and couple of (example)
executables. Library implements a simplistic HTTP server working in
synchroneous mode, while executables represents two different scenarios:

#. A simplest possible case of synchroneous HTTP server maintaining a *state*
   object. This *state* defines what is shown by certain HTTP route by GET
   request, while PATCH will modify this *state* object (typically, advancing
   an element with collection or increasing iteration number).
#. A more complex state of forking process which can be steered by client
   applications to dynamically create or destroy data sources. The server
   is not fully synchroneous then as new processes maintains their own state.

