// Scale a number, mapping between two number ranges
export const mapNumberToRange = (input, inputRangeMin, inputRangeMax, outputRangeMin, outputRangeMax) => {
    return ((input - inputRangeMin) * (outputRangeMax - outputRangeMin) /
        (inputRangeMax - inputRangeMin) +
        outputRangeMin);
};
//# sourceMappingURL=index.js.map