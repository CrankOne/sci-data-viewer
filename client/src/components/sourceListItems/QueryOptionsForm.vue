<template>
  <!-- Query options advertised by the source's manifest (doc/sources.rst,
       "Query options") -- one input per option, appended to the data
       fetch's query string; see connection.js's
       set_resource_query_value/load_resource_data. Shared by
       static.vue and addressable.vue. -->
  <form v-if="queryOptions.length" class="query-options" @submit.prevent>
    <div v-for="opt in queryOptions" :key="opt.name" class="query-option">
      <label :for="input_id(opt)" :title="opt.description">
        {{ opt.name }}<span v-if="opt.required" class="query-option-required" title="required">*</span>
      </label>

      <input
        v-if="opt.schema?.type === 'boolean'"
        :id="input_id(opt)"
        type="checkbox"
        :checked="!!current_value(opt)"
        @change="on_change(opt, $event.target.checked)"
      >

      <select
        v-else-if="opt.schema?.type === 'string' && opt.schema?.enum"
        :id="input_id(opt)"
        :value="current_value(opt)"
        @change="on_change(opt, $event.target.value)"
      >
        <option v-for="v in opt.schema.enum" :key="v" :value="v">{{ v }}</option>
      </select>

      <input
        v-else-if="opt.schema?.type === 'integer' || opt.schema?.type === 'number'"
        :id="input_id(opt)"
        type="number"
        :step="opt.schema.type === 'integer' ? 1 : 'any'"
        :min="opt.schema.minimum"
        :max="opt.schema.maximum"
        :value="current_value(opt)"
        @change="on_change(opt, parse_numeric(opt, $event.target.value))"
      >

      <input
        v-else
        :id="input_id(opt)"
        type="text"
        :value="current_value(opt)"
        @change="on_change(opt, $event.target.value)"
      >
    </div>
  </form>
</template>

<script>
export default {
    name: 'QueryOptionsForm',
    props: {
        // Resource name -- used only to namespace input ids and to target
        // the connection/set_resource_query_value dispatch.
        name: {type: String, required: true},
        queryOptions: {type: Array, default: () => []},
        queryValues: {type: Object, default: () => ({})}
    },
    methods: {
        input_id(opt) {
            return `query-opt-${this.name}-${opt.name}`;
        },
        // Current value, falling back to the schema default when the user
        // has not touched this option yet.
        current_value(opt) {
            const v = this.queryValues[opt.name];
            return v !== undefined ? v : opt.schema?.default;
        },
        parse_numeric(opt, raw) {
            if(raw === '') return undefined;
            return opt.schema.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
        },
        on_change(opt, value) {
            this.$store.dispatch('connection/set_resource_query_value', {name: this.name, key: opt.name, value});
        }
    }
}
</script>

<style scoped>
.query-options {
  margin-top: 6pt;
  display: flex;
  flex-direction: column;
  gap: 3pt;
}

.query-option {
  display: flex;
  align-items: center;
  gap: 6pt;
  font-size: .85rem;
}

.query-option label {
  color: var(--clr-fg-main-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.query-option-required {
  color: var(--clr-fg-main-highlighted);
}

.query-option input[type="number"],
.query-option input[type="text"],
.query-option select {
  flex: 1 1 auto;
  min-width: 0;
}

.query-option input[type="checkbox"] {
  flex: 0 0 auto;
}
</style>
