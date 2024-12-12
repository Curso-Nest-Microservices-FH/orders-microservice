import { OrderStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationDto } from "../../common/dtos/pagination.dto";
import { OrderStatusList } from "src/enum/order.enum";



export class PaginationOrderDto extends PaginationDto {

    @IsOptional()
    @IsEnum( OrderStatusList, {
        message: `Valid status are ${OrderStatusList}`
    })
    status: OrderStatus
}