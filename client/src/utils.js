// Various utilities (occasionally, some of them might be found in libraries
// like lodash, etc).

// Split array onto sub-arrays, based on the field value of objects
//  see: https://stackoverflow.com/a/60835733/1734499
export function groupBy(arr, property) {
  return arr.reduce((acc, cur) => {
    acc[cur[property]] = [...acc[cur[property]] || [], cur];
    return acc;
  }, {});
}

