<template>
  <SourceListItem>
    <template v-slot="body">
      <br v-if="pages_enabled"/>
      <span v-if="pages_enabled">1, 2 ... 48, 49, 50, ... 67, 68</span>
      <br v-if="pages_enabled"/>
      <select v-if="pages_enabled" name="pets" size="4">
        <option value="4031-12-1024">4031-12-1024</option>
        <option value="4031-12-1025">4031-12-1025</option>
        <option value="4031-12-1027">4031-12-1027</option>
        <option value="4031-12-1031">4031-12-1031</option>
      </select>
      <br v-if="pages_enabled"/>
    </template>
  </SourceListItem>
</template>
