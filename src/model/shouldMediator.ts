export default class ShouldMediator<T> {
  private subjects: T[]

  constructor(subjects: T[] = []) {
    this.subjects = subjects
  }

  public getSubjects(): T[] {
    return this.subjects
  }

  public beEmpty(): boolean {
    return this.subjects.length === 0
  }
}