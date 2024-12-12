import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaginationOrderDto } from './dto/pagination-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config/services';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit{

  private readonly logger = new Logger('OrdersService')

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ){
    super()
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('DataBase Connected')
  }

  
  async create(createOrderDto: CreateOrderDto) {
    
    try {

      //1 confirmar los ids de los productos
      const productIds = createOrderDto.items.map((item) => item.productId)

      const products: any[] = await firstValueFrom(
        this.client.send({cmd: 'validate_products'}, productIds)
      )

    // 2 calculos de los valores
    const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {

        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price
         return price * orderItem.quantity
    }, 0)

    const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
      return acc + orderItem.quantity
    }, 0)


    // 3  crear una transaccion de base de datos
  const order = await this.order.create({
    data: {
      totalAmount: totalAmount,
      totalItems: totalItems,
      OrderItem: {
        createMany: {
          data: createOrderDto.items.map((orderItem) => ({
            price: products.find( (product) => product.id === orderItem.productId).price,
            productId: orderItem.productId,
            quantity: orderItem.quantity
          }))
        }
      }
    },
    include: {
      OrderItem: {
        select: {
          price: true,
          quantity: true,
          productId: true
        }
      }
    }
  })
  
  return {
    ...order,
    OrderItem: order.OrderItem.map((orderItem) => ({
      ...orderItem,
      name: products.find((product) => product.id === orderItem.productId)
        .name
    }))
  }
      
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs'
      })
    }

    

    
     
  }

  async findAll(paginationOrderDto: PaginationOrderDto) {

    const totalPages = await this.order.count({
      where: {
        status: paginationOrderDto.status
      }
    })

    const currentPage = paginationOrderDto.page
    const perPage = paginationOrderDto.limit


    return {
      data: await this.order.findMany({
        skip: ( currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: paginationOrderDto.status
        }
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage)
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where: {id},
      include:{
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true
          }

        }
      }
    })

    if(!order){
      throw new RpcException({status: HttpStatus.NOT_FOUND, message: `Order with id ${id} not found`})
    }


    const productIds = order.OrderItem.map( orderItem => orderItem.productId )
    const product: any[] = await firstValueFrom(
      this.client.send({cmd: 'validate_products'}, productIds)
    )

    return {
      ...order,
      OrderItem: order.OrderItem.map( orderItem => ({
        ...orderItem,
        name: product.find( product => product.id === orderItem.productId).name
      }))
    }

  }


  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto){

    const {id, status} = changeOrderStatusDto

    const order = await this.findOne(id)

    if(order.status === status) {
      return order
    }

    return this.order.update({
      where: {id},
      data: {status: status}
    })
  }


}
