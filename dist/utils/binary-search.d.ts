declare const BinarySearch: {
    search: <T>(list: T[], comparisonFn: (candidate: T) => 0 | 1 | -1) => T | null;
};
export default BinarySearch;
