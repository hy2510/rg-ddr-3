# map-number-to-range
 'Converts' a number within a range to it's corresponding value in another range.

## Installing
```
npm install --save tdous/map-number-to-range
```

## Usage
```
import { mapNumberToRange } from 'map-number-to-range';

// I have a value, 6, in a linear range of possible values from 0 to 10
const input = 6;

// I need that equivalent proportional value of a range from 100 to 200
const mappedNumber = mapNumberToRange(input, 0, 10, 100, 200);

// mappedNumber === 160
