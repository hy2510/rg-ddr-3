// Scale a number, mapping between two number ranges
export const mapNumberToRange = (
  input: number,
  inputRangeMin: number,
  inputRangeMax: number,
  outputRangeMin: number,
  outputRangeMax: number
): number => {
  return (
    (input - inputRangeMin) * (outputRangeMax - outputRangeMin) /
      (inputRangeMax - inputRangeMin) +
    outputRangeMin
  );
};
