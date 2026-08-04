import { ODataService } from "./ODataService";

export interface Person {
    ID: string;
    Name: string;
    Income: number;
    ExpenseTarget: number;
    Currency: string | { code?: string };
    Email?: string;
    Phone?: string;
    ImageType?: string;
}

const PERSON_SELECT = ["ID", "Name", "Income", "ExpenseTarget", "Currency", "Email", "Phone", "ImageType"];

/**
 * Read model for the `Persons` entity of the ExpenseManager service.
 */
export class PersonService {

    private readonly odata: ODataService;

    public constructor(odata: ODataService) {
        this.odata = odata;
    }

    public async fetchAll(): Promise<Person[]> {
        return this.odata.requestEntitySet<Person>("Persons", { select: PERSON_SELECT });
    }

    public getImageUrl(person: Pick<Person, "ID" | "ImageType">): string {
        if (!person.ImageType) {
            return "";
        }
        return this.odata.getMediaUrl(`Persons(ID='${person.ID}',IsActiveEntity=true)/Image`);
    }
}
